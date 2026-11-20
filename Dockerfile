FROM python:3.12-slim
WORKDIR /app
COPY index.html /app/index.html
COPY server.py /app/server.py
ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
