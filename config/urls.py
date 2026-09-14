from django.contrib import admin
from django.urls import include, path
from racing import views

urlpatterns = [path('', views.dashboard, name='dashboard'), path('api/comparison/', views.comparison, name='comparison'), path('bookmarks/', views.bookmark, name='bookmark'), path('signup/', views.signup, name='signup'), path('accounts/', include('django.contrib.auth.urls')), path('admin/', admin.site.urls)]
