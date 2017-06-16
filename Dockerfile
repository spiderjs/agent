FROM node:6.10.0

MAINTAINER yayanyang@gmail.com

COPY ./ /agent

WORKDIR /agent
RUN yarn && yarn run build

VOLUME ["/agent/logs","/agent/fq"]

CMD ["node", "dist/src/app.js"]