window.ES_CONFIG = {
  useDemo: true,
  node: "https://your-elasticsearch-host",
  username: "your-username",
  password: "your-password",
  index: "your-index-name",
  fields: {
    time: "@timestamp",
    line: "line",
    model: "model",
    serial: "board_id",
    general: "general",
    result: "result",
  },
};
