/*
class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "pitchRatio",
        defaultValue: 1.0,
        minValue: 0.5,
        maxValue: 2.0,
        automationRate: "k-rate"
      }
    ];
  }

  constructor() {
    super();
    this.buffer = [];
    this.readIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) return true;

    const outChannels = output.length;
    const inChannels = input.length;
    const pitchRatioValues = parameters.pitchRatio;
    const pitchRatio = pitchRatioValues.length ? pitchRatioValues[0] : 1.0;

    for (let ch = 0; ch < outChannels; ch++) {
      const out = output[ch];
      const inp = input[ch] || input[0];

      if (!inp) {
        out.fill(0);
        continue;
      }

      for (let i = 0; i < out.length; i++) {
        const srcIndex = i * pitchRatio;
        const idx0 = Math.floor(srcIndex);
        const idx1 = Math.min(idx0 + 1, inp.length - 1);
        const frac = srcIndex - idx0;

        const s0 = inp[idx0] ?? 0;
        const s1 = inp[idx1] ?? 0;
        out[i] = s0 + (s1 - s0) * frac;
      }
    }

    return true;
    */
  }
}

registerProcessor("pitch-shifter-processor", PitchShifterProcessor);
