"""Application-wide HTTP error handlers."""

from flask import render_template


def bad_request(e):
    return render_template("400.html"), 400

def unauthorized(e):
    return render_template("error.html", code=401, title="Unauthorized",
                           message="Please sign in to continue."), 401

def forbidden(e):
    return render_template("error.html", code=403, title="Forbidden",
                           message="You don't have permission to access this resource."), 403

def not_found(e):
    return render_template("404.html"), 404

def request_entity_too_large(e):
    return render_template("error.html", code=413, title="File Too Large",
                           message="Uploaded file exceeds the 100MB limit."), 413

def too_many_requests(e):
    return render_template("error.html", code=429, title="Too Many Requests",
                           message="You're sending requests too quickly. Please try again later."), 429

def internal_error(e):
    return render_template("500.html"), 500

def service_unavailable(e):
    return render_template("error.html", code=503, title="Service Unavailable",
                           message="The service is temporarily unavailable. Try again later."), 503

def handle_exception(e):
    return render_template("500.html"), 500
