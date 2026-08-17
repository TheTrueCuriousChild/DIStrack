import { app } from "./app.js";
import { config } from "./config/env.js";

const PORT = config.port || 3004;

app.listen(PORT, () => {
  console.log(`Supply server running on port ${PORT}`);
});
