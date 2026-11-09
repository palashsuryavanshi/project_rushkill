FROM pierrezemb/gostatic

# Copy only the dist folder for static serving
COPY dist /srv/http

# Set the working directory
WORKDIR /srv/http

# Start the static server - default path is /srv/http
CMD ["-port","8080","-https-promote", "-enable-logging"]