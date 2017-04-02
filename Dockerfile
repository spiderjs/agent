FROM node:6.10.0

MAINTAINER yayanyang@gmail.com

COPY ./src /agent/src
COPY ./config /agent/config
COPY ./package.json /agent/package.json
COPY ./tsconfig.json /agent/tsconfig.json


WORKDIR /agent
RUN npm install && npm run build

VOLUME ["/agent/logs"]

CMD ["node", "build/bin/server.js"]

