from flask import render_template

def init_routes(app):
    @app.route('/')
    def Interface():
        return render_template('Rádio.html')
