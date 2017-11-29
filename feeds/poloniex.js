const { EventEmitter } = require('events');

class PoloniexFeed extends EventEmitter {
  constructor() {
    super();
    const PoloManager = require('poloniex-orderbook');
    const poloman = new PoloManager().connect();

    // call connect to initiate socket connection
    poloman.connect();
    poloman.market('USDT_BTC');
    poloman.on('change', (info) => {
      const { channel, side } = info;
      const market = poloman.market(channel);
      const top10 = market[side].slice(0, 10);

      const event = `orderbook-${(side === 'asks') ? 'sell' : 'buy'}`;
      this.emit(event, top10.map(order => ({
        price: order[0],
        amount: order[1],
      })));
    });
  }
}

module.exports = PoloniexFeed;
