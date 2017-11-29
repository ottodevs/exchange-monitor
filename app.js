const config = require('./config.json');
const redis = require('redis');

config.exchanges.forEach((exch) => {
  const client = redis.createClient(exch.redisUrl);
  const FeedClass = require(`./feeds/${exch.uid}`);
  const feed = new FeedClass(exch.params);
  client.on('connect', () => {
    console.log(`Connected to ${exch.redisUrl}`);
    ['orderbook-sell', 'orderbook-buy', 'trades-sell', 'trades-buy'].forEach((event) => {
      feed.on(event, (data) => {
        const key = (exch.prefix ? `${exch.prefix}:` : '') + event;
        client.set(key, JSON.stringify(data));
      });
    });
  });
});
