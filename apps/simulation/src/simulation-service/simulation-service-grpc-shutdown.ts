import type { Server } from "@grpc/grpc-js";

/** Stops accepting new calls and resolves once in-flight ones have finished. */
export const shutdownGrpcServer = (server: Pick<Server, "tryShutdown">): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.tryShutdown((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
