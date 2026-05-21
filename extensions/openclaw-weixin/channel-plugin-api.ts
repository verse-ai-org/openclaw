// Keep bundled channel entry imports narrow so bootstrap/discovery paths do
// not drag monitor/send/login surfaces into lightweight channel plugin loads.
export { weixinPlugin } from "./src/channel.js";
