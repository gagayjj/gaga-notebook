#include <unistd.h>

int main() {
  chdir("/Users/mac/Documents/ChatGPT/笔记本");
  execl(
      "/Users/mac/Documents/ChatGPT/笔记本/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      "Electron",
      "/Users/mac/Documents/ChatGPT/笔记本",
      NULL);
  return 1;
}
