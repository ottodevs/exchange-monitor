const URL = 'wss://cryptottlivewebapi.xbtce.net:3020';

const { EventEmitter } = require('events');
const WS = require('ws');
const CryptoJS = require('crypto-js');

function createSignature(timestamp, id, key, secret) {
  const hash = CryptoJS.HmacSHA256(timestamp + id + key, secret);
  return CryptoJS.enc.Base64.stringify(hash);
}

class XbtceFeed extends EventEmitter {
  constructor(params) {
    super();

    this.params = params;
    this.ws = new WS(URL);

    this.ws.on('open', this.handleConnect.bind(this));
    this.ws.on('message', this.handleMessage.bind(this));
  }
  performLogin() {
    const timestamp = Date.now();
    const msg = (JSON.stringify({
      Id: 'login',
      Request: 'Login',
      Params: {
        AuthType: 'HMAC',
        WebApiId: this.params.apiId,
        WebApiKey: this.params.apiKey,
        Timestamp: timestamp,
        Signature: createSignature(
          timestamp,
          this.params.apiId,
          this.params.apiKey,
          this.params.apiSecret
        ),
        DeviceId: 'FeedReader',
        AppSessionId: '123',
      },
    }));
    this.ws.send(msg);
  }
  subscribeToFeed() {
    this.ws.send(JSON.stringify({
      id: 'feed_subscribe',
      Request: 'FeedSubscribe',
      Params: {
        Subscribe: [{
          Symbol: 'BTCUSD',
          BookDepth: 10,
        }],
      },
    }));
  }
  handleConnect() {
    this.performLogin();
  }
  handleMessage(data) {
    const msg = JSON.parse(data);
    if (msg.Id === 'login') {
      this.subscribeToFeed();
    }
    if (msg.Response === 'FeedTick') {
      this.processFeedTick(msg);
    }
  }
  processFeedTick(msg) {
    this.emit('orderbook-buy', msg.Result.Bids.map(order => ({
      price: order.Price,
      amount: order.Volume,
    })));
    this.emit('orderbook-sell', msg.Result.Asks.map(order => ({
      price: order.Price,
      amount: order.Volume,
    })));
  }
}

module.exports = XbtceFeed;
