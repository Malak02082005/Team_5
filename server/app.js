import express from "express";

// Define route imports
import lenderRequestRoutes from "./routes/lenderRequestRoutes.js";


const app = express();

app.use(express.json());

// Define your routes here
app.use("/api/lender-requests", lenderRequestRoutes);


export default app;