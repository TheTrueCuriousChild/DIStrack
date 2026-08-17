import "./config/env.js";

import { app } from "./app.js";

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`Inventory server listening on port ${port}`);
});
