FROM python:3.12-alpine
WORKDIR /app
COPY server.py .
RUN chmod +x server.py
EXPOSE 9006
CMD ["python3", "-u", "server.py", "9006"]
