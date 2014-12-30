###
# Compass
###

# Change Compass configuration
compass_config do |config|
  config.output_style = :expanded
  config.line_comments = false

  # Make a copy of sprites with a name that has no uniqueness of the hash.
  config.on_sprite_saved do |filename|
    if File.exists?(filename)
      FileUtils.cp filename, filename.gsub(%r{-s[a-z0-9]{10}\.png$}, '.png')
    end
  end

  # Replace in stylesheets generated references to sprites
  # by their counterparts without the hash uniqueness.
  config.on_stylesheet_saved do |filename|
    if File.exists?(filename)
      css = File.read filename
      File.open(filename, 'w+') do |f|
        f << css.gsub(%r{-s[a-z0-9]{10}\.png}, '.png')
      end
    end
  end
end

###
# Page options, layouts, aliases and proxies
###

# Per-page layout changes:
#
# With no layout
# page "/path/to/file.html", :layout => false
#
# With alternative layout
# page "/path/to/file.html", :layout => :otherlayout
#
# A path which all have the same layout
# with_layout :admin do
#   page "/admin/*"
# end

# Proxy pages (http://middlemanapp.com/dynamic-pages/)
# proxy "/this-page-has-no-template.html", "/template-file.html", :locals => {
#  :which_fake_page => "Rendering a fake page with a local variable" }

###
# Helpers
###

# Automatic image dimensions on image_tag helper
activate :automatic_image_sizes

# Reload the browser automatically whenever files change
activate :livereload

# activate :directory_indexes

# Methods defined in the helpers block are available in templates
# helpers do
#   def some_helper
#     "Helping"
#   end
# end

helpers do
  def slls(str)
    str.gsub /\s\/>/, '>'
  end
  def slls_image_tag(url, options={})
    (image_tag(url, options)).gsub /\s\/>/, '>'
  end

  def slls_css_link_tag(*source)
    (stylesheet_link_tag(*source)).gsub /\s\/>/, '>'
  end

  def slls_favicon_tag(*source)
    (favicon_tag(*source)).gsub /\s\/>/, '>'
  end

  def get_meta(type, default=data.default)
    current = current_page.data[type]
    default = default[type]
    current = default if current.nil?
  end

  def get_additional_style(current=nil, settings=data.styles)
    #p settings
    path = nil
    if settings then
      settings.each do |key, value|
        if current == key then
          path = value
        end
      end
    end
    return path
  end

  def get_data_main(current=nil, settings=data.scripts)
    url = '/js'
    options = {:relative => false}

    if build? then
      url << '/all'
      options = {:relative => true}
    else
      url << '/main'
    end

    if settings then
      settings.each do |id|
        if current == id then
          url << '-' << id
        end
      end
    end

    url << '.js'
    url = url_for(url, options)
  end
end

set :css_dir, 'css'

set :js_dir, 'js'

set :images_dir, 'img'

#set :bower_dir, '../bower_components'

set :layouts_dir, 'layouts'

set :slim, { :pretty => true, :sort_attrs => false, :format => :html }

set :relative_links, true

# configure :development do
#   set :debug_assets, true
# end

# Build-specific configuration
configure :build do
  # For example, change the Compass output style for deployment
  # activate :minify_css

  # Minify Javascript on build
  # activate :minify_javascript

  # Enable cache buster
  # activate :asset_hash

  # Use relative URLs
  activate :relative_assets

  # Or use a different image path
  # set :http_path, "/Content/images/"

  ignore "*.bak"
  ignore "js/build.js"
  ignore "js/build-*.js"
  ignore "js/main.js"
  ignore "js/main-*.js"
  ignore "js/mod"
  ignore "js/mod/*.js"
  ignore "js/app"
  ignore "js/app/*.js"
  ignore "js/spec"
  ignore "js/spec/*.js"

end

# configure :development do
#   activate :php
# end


# Middlemanの中でbowerを使う
# http://www.e2esound.com/wp/2013/05/09/bower_in_middleman_project/
after_configuration do 
  sprockets.append_path "#{root}/bower_components/"
end

# after_configuration do
#   sprockets.append_path "#{root}/components/js/"
# end
