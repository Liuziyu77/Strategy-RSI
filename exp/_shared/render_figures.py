"""Publication figures for one game; shared visual grammar, independent data and output."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import sys
os.environ.setdefault('MPLCONFIGDIR', str(Path(tempfile.gettempdir()) / 'strategy-rsi-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, to_rgb
from matplotlib.patches import FancyBboxPatch
from matplotlib.ticker import PercentFormatter
import numpy as np

NAMES = ['DeepSeek V4 Flash', 'GLM-5.2', 'Kimi K3', 'Qwen3.8 Max']
SHORT = ['DeepSeek', 'GLM', 'Kimi', 'Qwen']
COLORS = ['#22857E', '#BC8A3A', '#6479B8', '#AF667E']
THEMES = {'chess':('CHESS', '#F3F6FB', '#203A58', '#62758B', '#E1E8F1', '#537FAF'),
          'xiangqi':('XIANGQI', '#FAF5F0', '#5B342E', '#947468', '#EEE2D9', '#AA6254'),
          'werewolf':('WEREWOLF', '#F5F3FA', '#372D57', '#827795', '#E8E2F0', '#8770AD')}


def render(root, input_path=None, output_path=None):
    root=Path(root)
    source=Path(input_path) if input_path else root/'results.json'
    out=Path(output_path) if output_path else root/'assets'
    d=json.loads(source.read_text())
    a=json.loads(source.with_name('analysis.json').read_text())
    assert a['inputSha256']==hashlib.sha256(source.read_bytes()).hexdigest()
    if out.resolve()==(root/'assets').resolve():
        assert d['complete'] and d['verification']['allPassed'], 'Use --output for partial previews.'
    game,bg,ink,muted,grid,accent=THEMES[d['gameType']]
    wolf=d['gameType']=='werewolf'
    cmap=LinearSegmentedColormap.from_list('performance',['#E9C9C5','#F4F3F0',accent])
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12.5,'text.color':ink,
       'axes.labelcolor':muted,'xtick.color':muted,'ytick.color':ink,'axes.edgecolor':grid,
       'svg.fonttype':'path','svg.hashsalt':'strategy-rsi-game-studies-20260917',
       'savefig.facecolor':bg,'figure.facecolor':bg,'axes.facecolor':'white'})
    out.mkdir(parents=True,exist_ok=True)
    def text(fig,x,y,s,size=12,color=None,weight='normal',**kw):
        return fig.text(x,y,s,fontsize=size,color=color or ink,fontweight=weight,**kw)
    def tint(color,white=.7):
        return tuple((1-white)*c+white for c in to_rgb(color))
    def frame(n,title,sub,note):
        fig=plt.figure(figsize=(12.8,5.8),dpi=160)
        text(fig,.038,.953,'STRATEGY–RSI   /   '+game+' BASELINE',10,muted,'bold')
        text(fig,.962,.953,'{:02d} / 06'.format(n),10,muted,ha='right')
        text(fig,.038,.882,title,23,weight='bold')
        text(fig,.038,.825,sub,11.8,muted)
        fig.add_artist(FancyBboxPatch((.025,.138),.95,.637,
           boxstyle='round,pad=0.008,rounding_size=0.018',transform=fig.transFigure,
           facecolor='white',edgecolor=grid,linewidth=.9,zorder=-10))
        text(fig,.038,.087,note,10.2,muted)
        text(fig,.038,.035,'RSI off · Empty memory · Chat on · Four fixed models',9.7,muted)
        text(fig,.962,.035,('FINAL DATA' if d['complete'] else 'PARTIAL PREVIEW')+' / '+d['generatedAt'][:10],9.5,muted,ha='right')
        return fig
    def axes(fig,rect,xmax=100,percent=True):
        ax=fig.add_axes(rect)
        for spine in ax.spines.values(): spine.set_visible(False)
        ax.set_xlim(0,xmax);ax.set_axisbelow(True);ax.xaxis.grid(True,color=grid,linewidth=.8)
        ax.tick_params(axis='both',length=0,pad=9);ax.set_yticks([])
        if percent:
            ax.xaxis.set_major_formatter(PercentFormatter(100,decimals=0));ax.set_xticks([0,25,50,75,100])
        return ax
    def labels(fig,ax):
        for i in range(4):
            fy=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
            text(fig,.046,fy,NAMES[i],12.8,COLORS[i],'bold',va='center')
    def save(fig,name):
        fig.savefig(out/(name+'.svg'),metadata={'Date':None,'Creator':'Strategy-RSI'})
        fig.savefig(out/(name+'.png'),dpi=220,metadata={'Software':'Strategy-RSI'})
        plt.close(fig)
    m=d['aggregate']
    fig=frame(1,'Team victory across four models' if wolf else 'Performance across four models',
       '{} completed / {} scheduled games · 95% clustered bootstrap intervals'.format(m['finished'],d['plannedBaseline']),
       'Seats share team outcomes; intervals resample all eight games in each role-seed block.' if wolf else
       'Score = (wins + 0.5 × draws) / completed games. Intervals resample repetition blocks within each pair.')
    ax=axes(fig,[.253,.223,.49,.443]);ax.set_ylim(3.58,-.66)
    for i,row in enumerate(a['models']):
        if row['estimate'] is None: continue
        p=row['estimate']*100; lo,hi=np.array(row['ci95'])*100
        ax.barh(i,p,height=.36,color=tint(COLORS[i],.84),zorder=2)
        ax.plot([lo,hi],[i,i],color=COLORS[i],linewidth=2,zorder=3)
        ax.plot([lo,lo],[i-.055,i+.055],color=COLORS[i],linewidth=1.5)
        ax.plot([hi,hi],[i-.055,i+.055],color=COLORS[i],linewidth=1.5)
        ax.scatter([p],[i],s=65,color=COLORS[i],zorder=4)
        ax.text(p,i-.27,'{:.1f}%'.format(p),ha='center',color=COLORS[i],weight='bold',fontsize=13)
        y=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
        text(fig,.793,y+.016,'{} / {} wins'.format(row['wins'],row['participations']) if wolf else
             '{} W · {} D · {} L'.format(row['wins'],row['draws'],row['losses']),11.4,weight='bold')
        text(fig,.793,y-.025,'{} missing seats'.format(row['missingParticipations']) if wolf else
             '{} completed games'.format(row['participations']),10,muted)
    labels(fig,ax)
    text(fig,.253,.714,'TEAM WIN RATE' if wolf else 'SCORE  /  DRAWS COUNT HALF',10.8,muted,'bold')
    text(fig,.793,.714,'COMPLETED PARTICIPATIONS',9.9,muted,'bold')
    save(fig,'win-rate')

    fig=frame(2,'Every role changes the task' if wolf else 'Head-to-head: the opponent matters',
        'Team wins / completed seat participations · Same model colors across all game studies' if wolf else
        'Row model against column opponent · Scores include rule draws and decision-limit draws',
        'Balanced schedule per model: 84 wolf, 42 seer, 42 witch, 42 hunter and 126 villager seats.' if wolf else
        'Each pair has 28 scheduled games. Missing outcomes stay outside the denominator and are reported separately.')
    nc=5 if wolf else 4; ax=fig.add_axes([.255,.242,.69,.435]);ax.set(xlim=(0,nc),ylim=(3.5,-.5));ax.axis('off')
    for i,cells in enumerate(a['matrix']['cells']):
        for j,cell in enumerate(cells):
            v=cell['score'];empty=v is None
            ax.add_patch(FancyBboxPatch((j+.028,i-.453),.944,.906,
               boxstyle='round,pad=0,rounding_size=0.085',facecolor=tint(accent,.94) if empty else cmap(v),linewidth=0))
            color='white' if v is not None and v>=.88 else ink
            ax.text(j+.5,i-.08,'—' if empty else '{:.1%}'.format(v),ha='center',va='center',fontsize=18,weight='bold',color=color)
            desc='same model' if not wolf and i==j else 'no completions' if empty else '{}/{} wins'.format(cell['wins'],cell['n']) if wolf else 'n = {}'.format(cell['n'])
            ax.text(j+.5,i+.25,desc,ha='center',va='center',fontsize=9.8,color=color if not empty else muted)
    labels(fig,ax)
    cols=['Wolf','Seer','Witch','Hunter','Villager'] if wolf else SHORT
    for j,c in enumerate(cols):text(fig,.255+.69*(j+.5)/nc,.716,c,11.5,muted,'bold',ha='center')
    cax=fig.add_axes([.255,.185,.34,.012]);bar=fig.colorbar(matplotlib.cm.ScalarMappable(norm=plt.Normalize(0,1),cmap=cmap),cax=cax,orientation='horizontal')
    bar.set_ticks([0,.5,1],labels=['0%','50%','100%']);bar.outline.set_visible(False);cax.tick_params(length=0,labelsize=9,pad=3)
    text(fig,.945,.178,'COMPLETED SEATS ONLY' if wolf else 'COMPLETED GAMES ONLY',9.8,muted,ha='right')
    save(fig,'role-win-rate' if wolf else 'head-to-head')

    fig=frame(3,'How long a game lasts',
       'Each dot is one game · Thick line: middle 50% · Thin line: 5th–95th percentiles',
       'Accumulated run time includes provider/queue waits, excludes pause downtime, and is not a controlled speed benchmark.')
    for pos,field,label,scale in [([.22,.25,.31,.39],'decisions','ACTIONS PER GAME',1),([.65,.25,.29,.39],'durationMs','ELAPSED MINUTES',60000)]:
        vals=[g[field]/scale for g in d['games']]
        ax=axes(fig,pos,max(vals+[1])*1.08,False);ax.set_ylim(1.6,-.6)
        text(fig,pos[0],.711,label,10.8,muted,'bold')
        for i,status in enumerate(['finished','error']):
            v=np.array([g[field]/scale for g in d['games'] if g['status']==status])
            color=accent if i==0 else '#B56C74'
            jitter=np.random.default_rng(900+i).uniform(-.16,.16,len(v))
            ax.scatter(v,i+jitter,s=13,color=color,alpha=.25,linewidths=0)
            if len(v):
                p5,q1,med,q3,p95=np.quantile(v,[.05,.25,.5,.75,.95])
                ax.plot([p5,p95],[i,i],color=color,lw=1.5);ax.plot([q1,q3],[i,i],color=color,lw=5,solid_capstyle='round')
                ax.scatter([med],[i],s=65,color=color,edgecolors='white',linewidths=1.3,zorder=4)
                ax.text(med,i-.30,'median {:.0f}'.format(med) if field=='decisions' else 'median {:.1f}'.format(med),ha='center',color=color,weight='bold',fontsize=11)
            if field=='decisions':
                y=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
                text(fig,.046,y,('Completed' if i==0 else 'Error')+'  (n={})'.format(len(v)),11.5,color,'bold',va='center')
    save(fig,'game-duration')

    fig=frame(4,'Protocol reliability and game endings',
       'Response acceptance measures API/schema/legality success; errors do not count as game losses',
       'All recorded model attempts, including retries. Stop-aborted HTTP requests without decision records are listed in the report.')
    ax=axes(fig,[.22,.237,.29,.431]);ax.set_ylim(3.55,-.55)
    for i,r in enumerate(d['reliabilityByModel']):
        p=100*r['accepted']/r['attempts'] if r['attempts'] else 0
        ax.barh(i,100,height=.40,color=tint('#B56C74',.8));ax.barh(i,p,height=.40,color=COLORS[i])
        ax.text(p-1.4,i,'{:.1f}%'.format(p),ha='right',va='center',color='white',weight='bold',fontsize=10.5)
    for i in range(4):
        y=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
        text(fig,.046,y,NAMES[i],12,COLORS[i],'bold',va='center')
    text(fig,.22,.714,'ACCEPTED RESPONSES',10.5,muted,'bold')
    ax=axes(fig,[.70,.237,.235,.431],d['plannedBaseline'],False);ax.set_ylim(3.55,-.55)
    outcomes=[('Rule win',m['wins'],accent),('Rule draw',m['ruleDraws'],'#89A6B5'),('Limit draw',m['decisionLimitDraws'],'#C39D58'),('Error',m['errors'],'#B56C74')]
    for i,(label,n,color) in enumerate(outcomes):
        ax.barh(i,n,height=.40,color=color);ax.text(n+2,i,str(n),va='center',weight='bold',fontsize=11)
        y=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
        text(fig,.59,y,label,11.2,color,va='center')
    ax.set_xlim(0,d['plannedBaseline']*1.13)
    text(fig,.59,.714,'{} RECORDED GAMES'.format(d['recordedBaseline']),10.5,muted,'bold')
    save(fig,'reliability')

    usage=d['usageByModel'];mx=max([(r['promptTokens']+r['completionTokens'])/1e6 for r in usage]+[1])
    fig=frame(5,'What the models consumed',
       'API-reported tokens for baseline games · Includes rejected responses and retry requests',
       'Output may include hidden reasoning. Missing usage is not estimated; these totals are not a billing statement.')
    ax=axes(fig,[.253,.224,.57,.438],mx*1.16,False);ax.set_ylim(3.55,-.6)
    for i,r in enumerate(usage):
        pin,pout=r['promptTokens']/1e6,r['completionTokens']/1e6
        ax.barh(i,pin,height=.37,color=tint(COLORS[i],.70));ax.barh(i,pout,left=pin,height=.37,color=COLORS[i])
        ax.text(pin+pout+mx*.016,i,'{:.2f}M'.format(pin+pout),va='center',weight='bold',color=COLORS[i],fontsize=11.5)
        y=fig.transFigure.inverted().transform(ax.transData.transform((0,i)))[1]
        text(fig,.877,y+.012,'{} calls'.format(r['requests']),10.3,weight='bold')
        text(fig,.877,y-.025,'{} no usage'.format(r['requests']-r['usageReported']),9.4,muted)
    labels(fig,ax);ax.set_xlabel('Tokens (millions)',fontsize=10.5)
    text(fig,.253,.714,'LIGHT = INPUT   /   SOLID = OUTPUT',10.8,muted,'bold')
    save(fig,'token-use')

    langs=sorted(d['byLanguage'],key=lambda x:x['locale'],reverse=True)
    fig=frame(6,'Communication during decisions',
       'Share of accepted decisions that produce a chat event · Completed games only',
       'Includes public speech and private wolf-team chat. Frequency does not establish a benefit from communication.' if wolf else
       'Forced actions are excluded. Speech is optional; frequency does not establish a benefit from communication.')
    ax=axes(fig,[.253,.224,.59,.438],114);ax.set_ylim(3.6,-.6)
    for i in range(4):
        for k,lang in enumerate(langs):
            r=lang['models'][i];p=(r['speechRate'] or 0)*100
            shift=0 if len(langs)==1 else -.145 if k==0 else .145
            ax.barh(i+shift,p,height=.35 if len(langs)==1 else .23,color=tint(COLORS[i],.65 if k==0 and len(langs)>1 else 0))
            ax.text(p+1.4,i+shift,'{:.1f}%'.format(p) if r['modelDecisions'] else 'N/A',fontsize=10.6,color=COLORS[i],va='center',weight='bold')
    labels(fig,ax)
    text(fig,.253,.714,'LIGHT = CHINESE   /   SOLID = ENGLISH' if len(langs)>1 else 'CHINESE PROMPTS AND CHAT',10.8,muted,'bold')
    save(fig,'chat-frequency')
    files=sorted(out.glob('*.svg'))+sorted(out.glob('*.png'))
    manifest={'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
       'analysisSha256':hashlib.sha256(source.with_name('analysis.json').read_bytes()).hexdigest(),
       'rendererSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
       'python':sys.version.split()[0],'numpy':np.__version__,'matplotlib':matplotlib.__version__,
       'pngDimensions':[2816,1276], 'outputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    (out/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Rendered six SVG and six PNG figures in '+str(out))
