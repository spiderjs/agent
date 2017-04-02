FROM node:6.10.0

MAINTAINER yayanyang@gmail.com

COPY ./ /agent

WORKDIR /agent
RUN npm install && npm run build

VOLUME ["/agent/logs"]

CMD ["node", "build/bin/server.js"]

