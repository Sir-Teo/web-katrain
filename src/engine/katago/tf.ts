// The engine's one entry point to TensorFlow.js.
//
// It used to import the `@tensorflow/tfjs` umbrella package, which also bundles
// Layers, the graph-model converter, tf.data and the WebGL backend. The engine
// builds its network from raw weights with core ops and only ever selects the
// CPU, WASM or WebGPU backend, so none of that was used, and it made up a large
// share of the worker bundle. Core plus the CPU backend is what the engine
// needs; worker.ts registers WASM and WebGPU itself.
import '@tensorflow/tfjs-backend-cpu';
// Tensor methods such as `x.add(y)` are attached by these side-effect imports,
// which the umbrella package made for every op. Register the ones the engine
// chains; a new one shows up as a type error here before it can fail at run
// time.
import '@tensorflow/tfjs-core/dist/public/chained_ops/add';
import '@tensorflow/tfjs-core/dist/public/chained_ops/mul';
import '@tensorflow/tfjs-core/dist/public/chained_ops/reshape';

export * from '@tensorflow/tfjs-core';
