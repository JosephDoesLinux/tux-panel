# ============================================================
#  Custom guacd built on Fedora 43 with FreeRDP 3.x
#
#  The official guacamole/guacd images ship FreeRDP 2.x which
#  cannot negotiate TLS with KDE's krdpserver 6.x.
#  This image builds guacd from the main branch (which supports
#  FreeRDP 3) against Fedora 43's FreeRDP 3.20.
# ============================================================

FROM fedora:43 AS builder

RUN dnf install -y \
    git cmake gcc gcc-c++ make automake autoconf libtool \
    freerdp-devel \
    cairo-devel libjpeg-turbo-devel libpng-devel \
    libuuid-devel \
    pango-devel \
    libssh2-devel \
    libvncserver-devel \
    libwebp-devel \
    pulseaudio-libs-devel \
    openssl-devel \
    libvorbis-devel \
    && dnf clean all

# Use the main branch which has FreeRDP 3 support
RUN git clone --depth 1 --branch main \
    https://github.com/apache/guacamole-server.git /build/guacamole-server

WORKDIR /build/guacamole-server

# FreeRDP 3.20 deprecates some APIs (codecs_free, FrameAcknowledge) that
# guacamole-server still uses.  The build enables -Werror, so we must
# suppress deprecation warnings to let the compile succeed.
RUN autoreconf -fi && \
    CFLAGS="-Wno-error=deprecated-declarations" \
    ./configure \
      --prefix=/opt/guacamole \
      --with-freerdp-plugin-dir=/opt/guacamole/lib/freerdp3 \
      --enable-allow-freerdp-snapshots \
      --disable-guaclog \
      --disable-guacenc && \
    make -j"$(nproc)" && \
    make install

# ── Runtime image ────────────────────────────────────────────────
FROM fedora:43

RUN dnf install -y \
    freerdp-libs \
    cairo libjpeg-turbo libpng \
    libuuid \
    pango \
    libssh2 \
    libvncserver \
    libwebp \
    pulseaudio-libs \
    openssl-libs \
    libvorbis \
    && dnf clean all

COPY --from=builder /opt/guacamole /opt/guacamole

ENV LD_LIBRARY_PATH=/opt/guacamole/lib
ENV PATH="/opt/guacamole/sbin:/opt/guacamole/bin:${PATH}"

EXPOSE 4822

CMD ["guacd", "-b", "0.0.0.0", "-L", "info", "-f"]
