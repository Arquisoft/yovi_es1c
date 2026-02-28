import express from 'express';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Users Service (TypeScript) is running!');
});

app.listen(port, () => {
  console.log(`Users Service listening on port ${port}`);
});