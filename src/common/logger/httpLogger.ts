import pinoHttp from "pino-http";
import logger from "./logger";
const httpLogger = pinoHttp({
  logger: logger,
  autoLogging: true,

  wrapSerializers: false,
  serializers: {},
  customReceivedMessage(req, _) {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    return `REQUEST: (ID:${req.id}) ${req.method} ${req.url} ${ip}`;
  },

  customSuccessMessage(req, res) {
    return `RESPONSE: (ID:${req.id}) ${req.method} ${req.url} ${res.statusCode} ${res.statusMessage}`;
  },

  customErrorMessage(req, res, error) {
    return `Error: (ID:${req.id}) ${req.method} ${req.url} ${res.statusCode} ${error.message}`;
  },
});

export default httpLogger;
