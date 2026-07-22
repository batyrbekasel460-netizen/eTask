import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { config } from "./config.js";
import { pool } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { filesRouter } from "./routes/files.js";
import { usersRouter } from "./routes/users.js";
import { workspaceRouter } from "./routes/workspace.js";
import { errorHandler } from "./middleware/error.js";

const app=express();
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}})); app.use(cors({origin:config.frontendOrigin.split(","),credentials:true})); app.use(compression()); app.use(express.json({limit:"2mb"})); app.use(morgan("combined"));
app.get("/api/health",async(_req,res)=>{await pool.query("SELECT 1");res.json({status:"ok",service:"eTask API"})});
app.use("/api/auth",authRouter); app.use("/api/tasks",tasksRouter); app.use("/api/files",filesRouter); app.use("/api/users",usersRouter); app.use("/api",workspaceRouter); app.use(errorHandler);
app.listen(config.port,config.host,()=>console.log(`eTask API: http://${config.host}:${config.port}`));
