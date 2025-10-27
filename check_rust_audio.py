#!/usr/bin/env python3
import sys

try:
    import rust_audio_resampler
    print('SUCCESS: rust_audio_resampler is installed')
    print('Version:', rust_audio_resampler.__version__)
except ImportError:
    print('ERROR: rust_audio_resampler is not installed')