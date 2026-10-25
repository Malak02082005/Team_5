import express from "express";

// Define route imports
import lenderRequestRoutes from "./routes/lenderRequestRoutes.js";
import adminLenderRequestRoutes from "./routes/adminLenderRequestRoutes.js";

const app = express();

app.use(express.json());

// Define your routes here
app.use("/api/lender-requests", lenderRequestRoutes);
app.use("/api/admin/lender-requests", adminLenderRequestRoutes);

export default app;
