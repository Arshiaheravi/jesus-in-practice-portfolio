if (!["website", "dashboard"].includes(process.env.APP))
  throw new Error("APP must select website or dashboard.");
await import(`./apps/${process.env.APP}/server.js`);
