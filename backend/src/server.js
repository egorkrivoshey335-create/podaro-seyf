import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { startExpirer } from "./services/expirer.js";

const expirerTask = startExpirer(prisma);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "gift safe backend started");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    expirerTask.stop();
    server.close(() => {
      logger.info({ signal }, "gift safe backend stopped");
      process.exit(0);
    });
  });
}
