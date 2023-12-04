import express from 'express';
const app = express();
//    ^? const app: Express

// Don't do this:
app.get('/health', (request: express.Request, response: express.Response) => {
  response.send('OK');
});

// Do this:
app.get('/health', (request, response) => {
  //                ^? (parameter) request: express.Request
  response.send('OK');
  // ^? (parameter) response: express.Response
});
