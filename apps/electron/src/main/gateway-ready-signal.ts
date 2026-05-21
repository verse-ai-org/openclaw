export type GatewayChildListenState = {
  sawListening: boolean;
};

const GATEWAY_LOG_ANSI_PATTERN = "\\x1b\\[[0-9;]*m";
const GATEWAY_LOG_ANSI_REGEX = new RegExp(GATEWAY_LOG_ANSI_PATTERN, "g");

export function stripGatewayLogAnsi(text: string): string {
  return text.replace(GATEWAY_LOG_ANSI_REGEX, "");
}

/** Match OpenClaw gateway listen-ready lines on stdout or stderr. */
export function matchesGatewayReadyLogLine(text: string): boolean {
  const plain = stripGatewayLogAnsi(text);
  return /listening on ws:\/\//i.test(plain) || /http server listening/i.test(plain);
}

export function noteChildGatewayReadySignal(
  state: GatewayChildListenState,
  text: string,
): void {
  if (matchesGatewayReadyLogLine(text)) {
    state.sawListening = true;
  }
}
