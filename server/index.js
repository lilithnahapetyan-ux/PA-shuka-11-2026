// Entry point: apply pending migrations, then start the HTTP server.
import { PORT } from './config.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

migrate();
createApp().listen(PORT, () => {
  console.log(`Shuka API listening on http://localhost:${PORT}`);
});
