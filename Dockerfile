FROM ubuntu

RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get upgrade -y
RUN apt-get install -y nodejs
RUN apt-get install -y build-essential
RUN apt-get install -y python3 python3-pip
RUN apt-get install -y libssl-dev libudev-dev

COPY package.json package.json
COPY package-lock.json package-lock.json
COPY index.js index.js
COPY db.js db.js
COPY dbconfig.js dbconfig.js
COPY schema.js schema.js
COPY http.js http.js
COPY tree.js tree.js
COPY ws.js ws.js

COPY user user

RUN npm install

ENTRYPOINT [ "node", "index.js" ]