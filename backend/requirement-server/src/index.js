import { app } from "./app.js";
import { config } from "./config/env.js";

const PORT = config.port || 3003;

app.listen(PORT, () => {
  console.log(`Requirement server running on port ${PORT}`);
});
