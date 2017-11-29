const URL = 'wss://api.bitfinex.com/ws/2';
const { EventEmitter } = require('events');
const WS = require('ws');
const CRC = require('crc-32');
const _ = require('lodash');

class BitfinexFeed extends EventEmitter {
  constructor() {
    super();

    this.BOOK = {};
    this.channelMap = {};

    this.lastTrades = {};

    this.ws = new WS(URL);

    this.ws.on('open', this.handleConnect.bind(this));
    this.ws.on('message', this.handleMessage.bind(this));
  }

  handleConnect() {
    this.channelMap = {};

    this.BOOK.bids = {};
    this.BOOK.asks = {};
    this.BOOK.psnap = {};
    this.BOOK.mcnt = 0;

    this.lastTrades = {
      sell: [],
      buy: [],
    };

    // send websocket conf event with checksum flag
    this.ws.send(JSON.stringify({ event: 'conf', flags: 131072 }));

    // send subscribe to get desired book updates
    this.ws.send(JSON.stringify({
      event: 'subscribe',
      channel: 'book',
      pair: 'tBTCUSD',
      prec: 'P0',
    }));

    this.ws.send(JSON.stringify({
      event: 'subscribe',
      channel: 'trades',
      symbol: 'BTCUSD',
    }));
  }

  handleMessage(msg) {
    const data = JSON.parse(msg);
    if (data.event) {
      this.handleEvent(data);
    } else if (data instanceof Array) {
      switch (this.channelMap[data[0]]) {
        case 'trades': this.handleTradeEvent(data);
          break;
        case 'book': this.handleBooksEvent(data);
          break;
        default:
      }
    }
  }
  handleEvent(msg) {
    if (msg.event === 'subscribed') {
      this.channelMap[msg.chanId] = msg.channel;
    }
  }
  handleBooksEvent(msg) {
    if (msg[1] === 'hb') return;

    // if msg contains checksum, perform checksum
    if (msg[1] === 'cs') {
      const checksum = msg[2];
      const csdata = [];
      const bidsKeys = this.BOOK.psnap.bids;
      const asksKeys = this.BOOK.psnap.asks;

      // collect all bids and asks into an array
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < 25; i++) {
        if (bidsKeys[i]) {
          const price = bidsKeys[i];
          const pp = this.BOOK.bids[price];
          csdata.push(pp.price, pp.amount);
        }
        if (asksKeys[i]) {
          const price = asksKeys[i];
          const pp = this.BOOK.asks[price];
          csdata.push(pp.price, -pp.amount);
        }
      }

      // create string of array to compare with checksum
      const csStr = csdata.join(':');
      const csCalc = CRC.str(csStr);
      if (csCalc !== checksum) {
        console.error('CHECKSUM FAILED');
        process.exit(-1);
      }
      this.emitBookUpdate();
      return;
    }

    // handle book. create book or update/delete price points
    if (this.BOOK.mcnt === 0) {
      _.each(msg[1], (pp) => {
        const side = pp[2] >= 0 ? 'bids' : 'asks';
        this.BOOK[side][pp[0]] = {
          price: pp[0],
          cnt: pp[1],
          amount: Math.abs(pp[2]),
        };
      });
    } else {
      const pp = { price: msg[1][0], cnt: msg[1][1], amount: msg[1][2] };

      // if count is zero, then delete price point
      if (!pp.cnt) {
        let found = true;

        if (pp.amount > 0) {
          if (this.BOOK.bids[pp.price]) {
            delete this.BOOK.bids[pp.price];
          } else {
            found = false;
          }
        } else if (pp.amount < 0) {
          if (this.BOOK.asks[pp.price]) {
            delete this.BOOK.asks[pp.price];
          } else {
            found = false;
          }
        }

        if (!found) {
          console.error('Book delete failed. Price point not found');
        }
      } else {
        // else update price point
        const side = pp.amount >= 0 ? 'bids' : 'asks';
        pp.amount = Math.abs(pp.amount);
        this.BOOK[side][pp.price] = pp;
      }

      // save price snapshots. Checksum relies on psnaps!
      _.each(['bids', 'asks'], (side) => {
        const sbook = this.BOOK[side];
        const bprices = Object.keys(sbook);
        const prices = bprices.sort((a, b) => {
          if (side === 'bids') {
            return +a >= +b ? -1 : 1;
          }
          return +a <= +b ? -1 : 1;
        });
        this.BOOK.psnap[side] = prices;
      });
    }
    // eslint-disable-next-line no-plusplus
    this.BOOK.mcnt++;
  }
  emitBookUpdate() {
    const buyOrders = this.BOOK.psnap.bids
      .sort()
      .reverse()
      .slice(0, 10)
      .map(price => this.BOOK.bids[price]);

    const sellOrders = this.BOOK.psnap.asks
      .sort()
      .slice(0, 10)
      .map(price => this.BOOK.asks[price]);

    this.emit('orderbook-sell', sellOrders);
    this.emit('orderbook-buy', buyOrders);
  }

  handleTradeEvent(msg) {
    // ignore heartbeat
    if (msg[1] === 'hb') return;
    let trades;
    if (msg[1] instanceof Array) {
      // initial snapshot
      [, trades] = msg;
    } else if (msg[1] === 'te') {
      trades = [msg[2]];
    } else {
      return;
    }
    trades.forEach((trade) => {
      const type = (trade[2] > 0) ? 'buy' : 'sell';
      this.lastTrades[type].unshift({
        timestamp: trade[1],
        amount: Math.abs(trade[2]),
        price: trade[3],
        type,
      });
      this.lastTrades[type] = this.lastTrades[type].slice(0, 10);
    });
    this.emitTradesUpdate();
  }
  emitTradesUpdate() {
    this.emit('trades-sell', this.lastTrades.sell);
    this.emit('trades-buy', this.lastTrades.buy);
  }
}

module.exports = BitfinexFeed;
