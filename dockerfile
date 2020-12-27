FROM node:11
COPY package.json yarn.lock /app/
WORKDIR /app/
RUN apt-get update && apt-get install -y ffmpeg && yarn
COPY . /app/
RUN yarn build
CMD ["yarn", "start"]