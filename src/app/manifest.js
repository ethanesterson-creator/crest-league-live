export default function manifest() {
  return {
    name: "Crest League Live",
    short_name: "Crest Live",
    description: "Live scoring, standings, stat leaders, highlights.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B1B3A",
    theme_color: "#0B1B3A",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
