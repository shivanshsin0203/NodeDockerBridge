require('dotenv').config();

const express = require("express");
const { createServer } = require("http");
const  initHttp  = require("./http.js");
const initWs = require("./ws.js");
const initDb = require("./dbconfig.js");
const cors = require("cors");

const app = express();

app.use(cors());
const httpServer = createServer(app);

initWs(httpServer);
initHttp(app);

const port = process.env.PORT || 3002;
httpServer.listen(port, () => {
  console.log(`listening on *:${port}`);
  initDb();
  console.log("Database connected");
});