require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const corsOptions = require('./config/cors');
const qaRoutes = require('./routes/qa');

const app = express();
const port = process.env.PORT || 3001;

// Connect to database
connectDB();

app.use(cors(corsOptions));
app.use(express.json());

// Mount routes
app.use('/api/ask', qaRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 