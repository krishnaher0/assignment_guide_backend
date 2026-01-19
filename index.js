const express = require('express');
const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('API running...');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
