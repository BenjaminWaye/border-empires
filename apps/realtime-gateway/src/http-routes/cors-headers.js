export const addCorsHeaders = (app) => {
    app.addHook("onSend", async (_request, reply, payload) => {
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
        reply.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
        return payload;
    });
    app.options("/*", async (_request, reply) => {
        reply
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
            .code(204);
        return "";
    });
};
