let config = {
  address: "0.0.0.0",
  port: 8080,
  basePath: "/",
  ipWhitelist: [],
  useHttps: false,
  language: "en",
  timeFormat: 24,
  units: "metric",
  modules: [
    { module: "alert" },
    {
      module: "MMM-Cursor",
      config: {
        timeout: 1500,
      },
    },
    { module: "clock", position: "top_left" },
    { module: "MMM-Photoprism2", position: "top_right", config: {} },
  ],
};

if (typeof module !== "undefined") {
  module.exports = config;
}
