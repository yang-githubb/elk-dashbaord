window.ES_CONFIG = {
  useDemo: true,
  node: "https://your-elasticsearch-host",
  username: "your-username",
  password: "your-password",
  index: "your-index-name",
  fields: {
    time: "@timestamp",
    line: "line",
    station: "station",
  },
};
