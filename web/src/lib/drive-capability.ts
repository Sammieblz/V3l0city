export function canRecordInMobileBrowser(input: { secureContext: boolean; geolocationAvailable: boolean; finePointer: boolean; viewportWidth: number }) {
  return input.secureContext && input.geolocationAvailable && !(input.finePointer && input.viewportWidth >= 768);
}
