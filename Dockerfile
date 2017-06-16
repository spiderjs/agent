FROM node:6.10.0

MAINTAINER yayanyang@gmail.com

COPY ./ /agent

WORKDIR /agent
RUN yarn && yarn run build && rm -rf node_modules

VOLUME ["/agent/logs"]

CMD ["node", "dist/src/app.js"]