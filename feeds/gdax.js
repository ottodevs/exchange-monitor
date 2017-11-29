const Gdax = require('gdax');


const orderbookSync = new Gdax.OrderbookSync('BTC-USD');
orderbookSync.on('message', () => {
  console.log(orderbookSync.books['BTC-USD'].state());
})
