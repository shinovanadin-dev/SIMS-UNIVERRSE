FROM python:3.12-slim
WORKDIR /app
COPY index.html /app/index.html
COPY package-translator.js /app/package-translator.js
COPY server.py /app/server.py
ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
