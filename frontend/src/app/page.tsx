export default function HomePage() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-float"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-float" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-float" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Navigation */}
      <nav className="glass sticky top-0 z-50 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <span className="text-lg font-bold text-white">AI</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">AI-ROS</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">How it Works</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <a href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Sign In</a>
              <a href="/login" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all">Get Started</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-32 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 px-5 py-2 rounded-full text-sm font-medium mb-8 border border-blue-100">
              <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></span>
              AI-Powered Recruitment Platform
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
            </div>
          </div>
          
          <h1 className="text-6xl md:text-7xl font-bold mb-8 leading-tight animate-fade-in stagger-1">
            Hire Smarter with
            <br />
            <span className="gradient-text">AI-Native</span> Recruitment
          </h1>
          
          <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto animate-fade-in stagger-2">
            Autonomous AI agents, live pair programming interviews, real-time collaboration, 
            and intelligent hiring workflows — all in one platform.
          </p>
          
          <div className="flex gap-4 justify-center animate-fade-in stagger-3">
            <a href="/login" className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold hover:shadow-xl hover:shadow-blue-500/25 transition-all transform hover:-translate-y-0.5">
              Start Free Trial
            </a>
            <a href="#features" className="px-8 py-4 border-2 border-gray-200 text-gray-700 rounded-2xl font-semibold hover:bg-gray-50 transition-all">
              Learn More
            </a>
          </div>
          
          <div className="mt-16 flex justify-center gap-12 text-sm text-gray-500 animate-fade-in stagger-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
              Free 14-day trial
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
              Cancel anytime
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything you need to hire better</h2>
            <p className="text-lg text-gray-600">Powered by AI, designed for humans.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: "🤖", title: "AI-Powered Screening", description: "Automated candidate evaluation with multi-dimensional scoring and explainable AI reasoning.", color: "from-blue-500 to-blue-600" },
              { icon: "💻", title: "Live Pair Programming", description: "Real-time coding interviews with AI-powered evaluation and progressive hints.", color: "from-purple-500 to-purple-600" },
              { icon: "🎯", title: "Smart Matching", description: "Semantic candidate-job matching with AI-ranked recommendations.", color: "from-green-500 to-green-600" },
              { icon: "🤝", title: "Recruiter Copilot", description: "AI assistant that helps you summarize candidates, compare applicants, and make decisions.", color: "from-orange-500 to-orange-600" },
              { icon: "⚡", title: "Workflow Automation", description: "No-code workflow builder with event-driven automation and approval chains.", color: "from-yellow-500 to-yellow-600" },
              { icon: "📊", title: "Real-time Analytics", description: "Live dashboards with hiring metrics, AI performance, and workforce analytics.", color: "from-red-500 to-red-600" },
            ].map((feature, i) => (
              <div key={i} className="group bg-white rounded-2xl p-8 border border-gray-100 hover:border-gray-200 transition-all hover-lift animate-fade-in" style={{animationDelay: `${i * 0.1}s`}}>
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl mb-6 shadow-lg`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-gray-50 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-lg text-gray-600">Three simple steps to transform your hiring</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { step: "01", title: "Upload & Parse", description: "Upload resumes and job descriptions. AI automatically parses and extracts key information.", color: "blue" },
              { step: "02", title: "AI Evaluate & Match", description: "AI agents evaluate candidates, match skills, and rank applicants automatically.", color: "purple" },
              { step: "03", title: "Interview & Hire", description: "Conduct live interviews with AI assistance. Make data-driven hiring decisions.", color: "green" },
            ].map((item, i) => (
              <div key={i} className="text-center animate-fade-in" style={{animationDelay: `${i * 0.2}s`}}>
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
            {[
              { value: "10x", label: "Faster Hiring" },
              { value: "95%", label: "AI Accuracy" },
              { value: "50%", label: "Cost Reduction" },
              { value: "4.9/5", label: "User Rating" },
            ].map((stat, i) => (
              <div key={i} className="animate-fade-in" style={{animationDelay: `${i * 0.1}s`}}>
                <p className="text-5xl font-bold gradient-text">{stat.value}</p>
                <p className="text-gray-600 mt-2 text-lg">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-3xl p-16 shadow-2xl shadow-blue-500/25">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to transform your hiring?</h2>
            <p className="text-blue-100 text-lg mb-8">Join hundreds of companies using AI-ROS to hire smarter.</p>
            <a href="/login" className="px-10 py-4 bg-white text-blue-600 rounded-2xl font-semibold hover:bg-blue-50 transition-all transform hover:-translate-y-0.5 inline-block shadow-xl">
              Get Started Free
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-100">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          <p>© 2025 AI-ROS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
