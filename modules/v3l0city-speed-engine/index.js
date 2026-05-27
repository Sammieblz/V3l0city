'use strict';

const { requireOptionalNativeModule, UnavailabilityError } = require('expo-modules-core');

const nativeModule = requireOptionalNativeModule('V3l0citySpeedEngine');

function unavailable(methodName) {
  return new UnavailabilityError('V3l0citySpeedEngine', methodName);
}

function isAvailable() {
  return nativeModule != null;
}

async function start(options = {}) {
  if (!nativeModule?.start) {
    throw unavailable('start');
  }
  await nativeModule.start(options);
}

async function stop() {
  if (!nativeModule?.stop) {
    return;
  }
  await nativeModule.stop();
}

async function reset() {
  if (!nativeModule?.reset) {
    return;
  }
  await nativeModule.reset();
}

async function setTripAccumulation(active) {
  if (!nativeModule?.setTripAccumulation) {
    return;
  }
  await nativeModule.setTripAccumulation(Boolean(active));
}

async function setMountOffsetDegrees(value) {
  if (!nativeModule?.setMountOffsetDegrees) {
    return;
  }
  await nativeModule.setMountOffsetDegrees(Number(value) || 0);
}

function addSpeedUpdateListener(listener) {
  return nativeModule?.addListener?.('speedUpdate', listener) ?? { remove() {} };
}

function addSpeedErrorListener(listener) {
  return nativeModule?.addListener?.('speedError', listener) ?? { remove() {} };
}

module.exports = {
  isAvailable,
  start,
  stop,
  reset,
  setTripAccumulation,
  setMountOffsetDegrees,
  addSpeedUpdateListener,
  addSpeedErrorListener,
};
