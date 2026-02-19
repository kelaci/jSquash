#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#ifdef __EMSCRIPTEN_PTHREADS__
#include <emscripten/threading.h>
#include "jxl/thread_parallel_runner.h"
#endif

#include "jxl/encode.h"

using namespace emscripten;

thread_local const val Uint8Array = val::global("Uint8Array");

struct JXLOptions {
  int effort;
  float quality;
  bool progressive;
  int epf;
  bool lossyPalette;
  size_t decodingSpeedTier;
  float photonNoiseIso;
  bool lossyModular;
  bool lossless;
  int bitDepth;  // 8 | 10 | 12 | 16 | 32
  int inputType;  // 0=u8 | 1=u16 | 2=f32
  int numChannels;  // 3=RGB | 4=RGBA
  int colorSpace;  // 0=sRGB | 1=Display-P3 | 2=Rec2020-PQ | 3=Rec2020-HLG
  bool premultipliedAlpha;
};

bool ComputeExpectedSize(uint32_t width, uint32_t height, int num_channels,
                         size_t bytes_per_sample, size_t* expected_size) {
  if (width == 0 || height == 0 || num_channels <= 0 || bytes_per_sample == 0) {
    return false;
  }

  const size_t width_s = static_cast<size_t>(width);
  const size_t height_s = static_cast<size_t>(height);
  const size_t channels_s = static_cast<size_t>(num_channels);
  const size_t max_size = std::numeric_limits<size_t>::max();

  if (width_s > max_size / height_s) return false;
  const size_t pixels = width_s * height_s;
  if (pixels > max_size / channels_s) return false;
  const size_t samples = pixels * channels_s;
  if (samples > max_size / bytes_per_sample) return false;

  *expected_size = samples * bytes_per_sample;
  return true;
}

bool IsSupportedCombination(int input_type, int bit_depth) {
  if (input_type == 0) return bit_depth == 8;
  if (input_type == 1) return bit_depth == 10 || bit_depth == 12 || bit_depth == 16;
  if (input_type == 2) return bit_depth == 32;
  return false;
}

bool SetupColorEncoding(int color_space, int input_type,
                        JxlColorEncoding* color_encoding) {
  if (color_space == 0) {
    if (input_type == 2) {
      JxlColorEncodingSetToLinearSRGB(color_encoding, /*is_gray=*/JXL_FALSE);
    } else {
      JxlColorEncodingSetToSRGB(color_encoding, /*is_gray=*/JXL_FALSE);
    }
    return true;
  }

  color_encoding->color_space = JXL_COLOR_SPACE_RGB;
  color_encoding->white_point = JXL_WHITE_POINT_D65;
  color_encoding->rendering_intent = JXL_RENDERING_INTENT_PERCEPTUAL;

  if (color_space == 1) {
    color_encoding->primaries = JXL_PRIMARIES_P3;
    color_encoding->transfer_function =
        input_type == 2 ? JXL_TRANSFER_FUNCTION_LINEAR : JXL_TRANSFER_FUNCTION_SRGB;
    return true;
  }

  if (color_space == 2) {
    color_encoding->primaries = JXL_PRIMARIES_2100;
    color_encoding->transfer_function = JXL_TRANSFER_FUNCTION_PQ;
    return true;
  }

  if (color_space == 3) {
    color_encoding->primaries = JXL_PRIMARIES_2100;
    color_encoding->transfer_function = JXL_TRANSFER_FUNCTION_HLG;
    return true;
  }

  return false;
}

bool SetFrameOption(JxlEncoderFrameSettings* frame_settings,
                    JxlEncoderFrameSettingId option, int32_t value) {
  return JxlEncoderFrameSettingsSetOption(frame_settings, option, value) ==
         JXL_ENC_SUCCESS;
}

val encode(std::string image, int width, int height, JXLOptions options) {
  if (width <= 0 || height <= 0) {
    return val::null();
  }

  if (options.numChannels != 3 && options.numChannels != 4) {
    return val::null();
  }

  if (!IsSupportedCombination(options.inputType, options.bitDepth)) {
    return val::null();
  }

  JxlDataType data_type = JXL_TYPE_UINT8;
  size_t bytes_per_sample = 1;
  if (options.inputType == 1) {
    data_type = JXL_TYPE_UINT16;
    bytes_per_sample = 2;
  } else if (options.inputType == 2) {
    data_type = JXL_TYPE_FLOAT;
    bytes_per_sample = 4;
  }

  size_t expected_size = 0;
  if (!ComputeExpectedSize(static_cast<uint32_t>(width), static_cast<uint32_t>(height),
                           options.numChannels, bytes_per_sample, &expected_size)) {
    return val::null();
  }

  if (expected_size != image.size()) {
    return val::null();
  }

  std::unique_ptr<JxlEncoder, decltype(&JxlEncoderDestroy)> encoder(
      JxlEncoderCreate(nullptr), JxlEncoderDestroy);
  if (!encoder) {
    return val::null();
  }

#ifdef __EMSCRIPTEN_PTHREADS__
  std::unique_ptr<void, decltype(&JxlThreadParallelRunnerDestroy)> runner(
      JxlThreadParallelRunnerCreate(nullptr, emscripten_num_logical_cores()),
      JxlThreadParallelRunnerDestroy);
  if (!runner) {
    return val::null();
  }

  if (JxlEncoderSetParallelRunner(encoder.get(), JxlThreadParallelRunner,
                                  runner.get()) != JXL_ENC_SUCCESS) {
    return val::null();
  }
#endif

  JxlBasicInfo basic_info;
  JxlEncoderInitBasicInfo(&basic_info);
  basic_info.xsize = static_cast<uint32_t>(width);
  basic_info.ysize = static_cast<uint32_t>(height);
  basic_info.bits_per_sample = static_cast<uint32_t>(options.bitDepth);
  basic_info.exponent_bits_per_sample = options.inputType == 2 ? 8 : 0;
  basic_info.num_color_channels = 3;
  basic_info.num_extra_channels = options.numChannels == 4 ? 1 : 0;
  basic_info.alpha_bits = options.numChannels == 4 ? basic_info.bits_per_sample : 0;
  basic_info.alpha_exponent_bits =
      options.numChannels == 4 ? basic_info.exponent_bits_per_sample : 0;
  basic_info.alpha_premultiplied =
      options.numChannels == 4 && options.premultipliedAlpha ? JXL_TRUE : JXL_FALSE;
  basic_info.uses_original_profile = JXL_TRUE;

  if (JxlEncoderSetBasicInfo(encoder.get(), &basic_info) != JXL_ENC_SUCCESS) {
    return val::null();
  }

  const int required_level = JxlEncoderGetRequiredCodestreamLevel(encoder.get());
  if (required_level < 0) {
    return val::null();
  }
  if (required_level == 10 &&
      JxlEncoderSetCodestreamLevel(encoder.get(), 10) != JXL_ENC_SUCCESS) {
    return val::null();
  }

  if (options.numChannels == 4) {
    JxlExtraChannelInfo alpha_info;
    JxlEncoderInitExtraChannelInfo(JXL_CHANNEL_ALPHA, &alpha_info);
    alpha_info.bits_per_sample = basic_info.alpha_bits;
    alpha_info.exponent_bits_per_sample = basic_info.alpha_exponent_bits;
    alpha_info.alpha_premultiplied = basic_info.alpha_premultiplied;
    if (JxlEncoderSetExtraChannelInfo(encoder.get(), 0, &alpha_info) !=
        JXL_ENC_SUCCESS) {
      return val::null();
    }
  }

  JxlColorEncoding color_encoding = {};
  if (!SetupColorEncoding(options.colorSpace, options.inputType, &color_encoding)) {
    return val::null();
  }

  if (JxlEncoderSetColorEncoding(encoder.get(), &color_encoding) != JXL_ENC_SUCCESS) {
    return val::null();
  }

  JxlEncoderFrameSettings* frame_settings =
      JxlEncoderFrameSettingsCreate(encoder.get(), nullptr);
  if (frame_settings == nullptr) {
    return val::null();
  }

  if (!SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_EFFORT,
                      std::clamp(options.effort, 1, 9))) {
    return val::null();
  }

  const int decoding_speed = static_cast<int>(
      std::min<size_t>(options.decodingSpeedTier, static_cast<size_t>(4)));
  if (!SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_DECODING_SPEED,
                      std::clamp(decoding_speed, 0, 4))) {
    return val::null();
  }

  if (options.epf >= -1 && options.epf <= 3 &&
      !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_EPF, options.epf)) {
    return val::null();
  }

  if (options.photonNoiseIso > 0.0f &&
      !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_PHOTON_NOISE,
                      static_cast<int32_t>(std::round(options.photonNoiseIso)))) {
    return val::null();
  }

  if (options.lossyPalette) {
    if (!SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_LOSSY_PALETTE, 1) ||
        !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_PALETTE_COLORS, 0) ||
        !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_MODULAR, 1)) {
      return val::null();
    }
  }

  if (options.lossyModular &&
      !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_MODULAR, 1)) {
    return val::null();
  }

  if (options.progressive) {
    if (!SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_QPROGRESSIVE_AC, 1) ||
        !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_RESPONSIVE, 1)) {
      return val::null();
    }
    if (!options.lossyModular &&
        !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_PROGRESSIVE_DC, 1)) {
      return val::null();
    }
  }

  if (options.lossless) {
    if (JxlEncoderSetFrameLossless(frame_settings, JXL_TRUE) != JXL_ENC_SUCCESS) {
      return val::null();
    }
  } else {
    const float quality = std::clamp(options.quality, 0.0f, 100.0f);
    float distance = 0.0f;

    if (quality >= 100.0f) {
      distance = 0.0f;
      if (options.lossyModular &&
          !SetFrameOption(frame_settings, JXL_ENC_FRAME_SETTING_MODULAR, 1)) {
        return val::null();
      }
    } else if (quality >= 30.0f) {
      distance = 0.1f + (100.0f - quality) * 0.09f;
    } else {
      distance =
          6.4f + std::pow(2.5f, (30.0f - quality) / 5.0f) / 6.25f;
    }

    if (JxlEncoderSetFrameDistance(frame_settings, distance) != JXL_ENC_SUCCESS) {
      return val::null();
    }
  }

  const JxlPixelFormat pixel_format = {
      static_cast<uint32_t>(options.numChannels), data_type, JXL_NATIVE_ENDIAN, 0};

  if (JxlEncoderAddImageFrame(frame_settings, &pixel_format, image.data(),
                              image.size()) != JXL_ENC_SUCCESS) {
    return val::null();
  }

  JxlEncoderCloseInput(encoder.get());

  std::vector<uint8_t> compressed(8192);
  uint8_t* next_out = compressed.data();
  size_t avail_out = compressed.size();

  while (true) {
    const JxlEncoderStatus process_result =
        JxlEncoderProcessOutput(encoder.get(), &next_out, &avail_out);

    if (process_result == JXL_ENC_NEED_MORE_OUTPUT) {
      const size_t offset = static_cast<size_t>(next_out - compressed.data());
      compressed.resize(compressed.size() * 2);
      next_out = compressed.data() + offset;
      avail_out = compressed.size() - offset;
      continue;
    }

    if (process_result != JXL_ENC_SUCCESS) {
      return val::null();
    }

    compressed.resize(static_cast<size_t>(next_out - compressed.data()));
    break;
  }

  return Uint8Array.new_(typed_memory_view(compressed.size(), compressed.data()));
}

EMSCRIPTEN_BINDINGS(my_module) {
  value_object<JXLOptions>("JXLOptions")
      .field("effort", &JXLOptions::effort)
      .field("quality", &JXLOptions::quality)
      .field("progressive", &JXLOptions::progressive)
      .field("lossyPalette", &JXLOptions::lossyPalette)
      .field("decodingSpeedTier", &JXLOptions::decodingSpeedTier)
      .field("photonNoiseIso", &JXLOptions::photonNoiseIso)
      .field("lossyModular", &JXLOptions::lossyModular)
      .field("lossless", &JXLOptions::lossless)
      .field("epf", &JXLOptions::epf)
      .field("bitDepth", &JXLOptions::bitDepth)
      .field("inputType", &JXLOptions::inputType)
      .field("numChannels", &JXLOptions::numChannels)
      .field("colorSpace", &JXLOptions::colorSpace)
      .field("premultipliedAlpha", &JXLOptions::premultipliedAlpha);

  function("encode", &encode);
}
