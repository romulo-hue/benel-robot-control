FROM node:20-bookworm

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY . .

ENV TZ=America/Sao_Paulo
ENV BENEL_HEADLESS=true
ENV BENEL_CONFIG_PATH=/app/config/benel-guberman-config.json
ENV BENEL_PROFILE_DIR=/app/data/profile
ENV BENEL_SCREENSHOT_DIR=/app/data/screenshots
ENV BENEL_SCHEDULER_STATE_PATH=/app/data/cloud-scheduler-state.json
ENV PORT=3000

RUN mkdir -p /app/config /app/data/profile /app/data/screenshots

CMD ["node", "benel_robot_control_server.mjs"]
