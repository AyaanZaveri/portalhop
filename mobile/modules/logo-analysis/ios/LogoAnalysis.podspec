Pod::Spec.new do |s|
  s.name           = 'LogoAnalysis'
  s.version        = '0.1.0'
  s.summary        = 'Measures a channel logo to decide how it should be presented'
  s.description    = 'The iOS half of the local logo-analysis module. The Android half is Kotlin under ../android and reaches the same verdicts.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
